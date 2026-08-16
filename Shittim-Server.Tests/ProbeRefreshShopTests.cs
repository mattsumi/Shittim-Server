using System.Text;
using BlueArchiveAPI.Services;
using Schale.FlatData;
using Xunit;
using Xunit.Abstractions;

namespace Shittim_Server.Tests;

public class ProbeRefreshShopTests(ITestOutputHelper output)
{
    // ShopRefreshExcel only carries a GoodsId; the cost and the reward both come from GoodsExcel. A row whose GoodsId does not resolve builds a shop slot that sells nothing, which is what a mismatched excel dump looks like from the client side.
    [Fact]
    public void EveryRefreshRowResolvesToAGoodsRow()
    {
        var excels = Excels();
        if (excels is null) { SkipNote(); return; }

        var refresh = excels.GetTable<ShopRefreshExcelT>();
        var goodsIds = excels.GetTable<GoodsExcelT>().Select(x => x.Id).ToHashSet();

        var unresolved = refresh.Where(x => !goodsIds.Contains(x.GoodsId)).ToList();

        var sb = new StringBuilder();
        foreach (var r in unresolved.Take(20))
            sb.AppendLine($"  refresh {r.Id} cat={r.CategoryType} group={r.RefreshGroup} goods={r.GoodsId}");

        Assert.True(unresolved.Count == 0, $"{unresolved.Count} of {refresh.Count} ShopRefreshExcel rows have an unresolved GoodsId\n{sb}");
    }

    [Fact]
    public void RefreshRowsCoverTheFourRefreshableCategories()
    {
        var excels = Excels();
        if (excels is null) { SkipNote(); return; }

        var refresh = excels.GetTable<ShopRefreshExcelT>();
        var categories = refresh.Select(x => x.CategoryType).Distinct().OrderBy(x => (int)x);

        Assert.Equal(
            [ShopCategoryType.General, ShopCategoryType.Arena, ShopCategoryType.GemDaily, ShopCategoryType.GemWeekly],
            categories);
    }

    private void SkipNote() => output.WriteLine(
        "No Resources/Dumped found, so the excel-backed assertions did not run. Build and start " +
        "the server once to populate it, then re-run.");

    private static ExcelTableService? Excels()
    {
        var dir = AppContext.BaseDirectory;
        while (dir != null && !Directory.Exists(Path.Combine(dir, "Shittim-Server")))
            dir = Path.GetDirectoryName(dir);

        var dumped = new[]
        {
            Path.Combine(dir!, "Shittim-Server", "Resources", "Dumped"),
            Path.Combine(dir!, "Shittim-Server", "bin", "Debug", "net10.0", "Resources", "Dumped"),
            Path.Combine(dir!, "Shittim-Server", "bin", "Release", "net10.0", "Resources", "Dumped"),
        }.FirstOrDefault(Directory.Exists);

        if (dumped is null) return null;

        ExcelTableService.DumpedDir = dumped;
        return new ExcelTableService();
    }
}
