using Shittim_Server.Services;
using Xunit;

namespace Shittim_Server.Tests;

public class SteamGameLocatorTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"shittim-locator-{Guid.NewGuid():N}");
    private readonly string _excel;

    public SteamGameLocatorTests()
    {
        _excel = Path.Combine(_root, "BlueArchive_Data", "StreamingAssets", "PUB", "Resource", "Preload", "TableBundles", "ExcelDB.db");
        Directory.CreateDirectory(Path.GetDirectoryName(_excel)!);
        File.WriteAllText(_excel, "db");
    }

    [Fact]
    public void AForwardSlashMetadataPathResolvesTheClientFile()
    {
        var metaPath = Path.Combine(_root, "BlueArchive_Data", "il2cpp_data", "Metadata", "global-metadata.dat").Replace('\\', '/');

        var found = SteamGameLocator.FindClientFile(metaPath,
            "BlueArchive_Data", "StreamingAssets", "PUB", "Resource", "Preload", "TableBundles", "ExcelDB.db");

        Assert.Equal(_excel, Path.GetFullPath(found!));
    }

    [Fact]
    public void ABackslashMetadataPathResolvesTheClientFile()
    {
        var metaPath = Path.Combine(_root, "BlueArchive_Data", "il2cpp_data", "Metadata", "global-metadata.dat").Replace('/', '\\');

        var found = SteamGameLocator.FindClientFile(metaPath,
            "BlueArchive_Data", "StreamingAssets", "PUB", "Resource", "Preload", "TableBundles", "ExcelDB.db");

        Assert.Equal(_excel, Path.GetFullPath(found!));
    }

    [Fact]
    public void AMetadataPathThatDoesNotContainTheClientTreeFallsThrough()
    {
        var found = SteamGameLocator.FindClientFile("/somewhere/else/global-metadata.dat",
            "BlueArchive_Data", "does-not-exist", "nothing.bin");

        Assert.Null(found);
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, true);
    }
}
