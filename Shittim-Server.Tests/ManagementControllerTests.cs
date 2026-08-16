using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Schale.Data;
using Schale.Data.GameModel;
using Shittim.Commands;
using Shittim_Server.Controllers;
using Xunit;

namespace Shittim_Server.Tests;

public class ManagementControllerTests : IDisposable
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"shittim-mgmt-{Guid.NewGuid():N}.sqlite3");
    private readonly string _dataDir = Path.Combine(Path.GetTempPath(), $"shittim-mgmt-data-{Guid.NewGuid():N}");
    private readonly string _savedDataDir;

    public ManagementControllerTests()
    {
        _savedDataDir = AccountDataCommand.accountDataDir;
        Directory.CreateDirectory(_dataDir);
        AccountDataCommand.accountDataDir = _dataDir;
    }

    [Theory]
    [InlineData("../escape.json")]
    [InlineData("sub/dir.json")]
    [InlineData("a\\b.json")]
    [InlineData("..\\..\\hosts.json")]
    public void UploadRejectsAnyNameThatIsNotABareFileName(string name)
    {
        var result = Controller().UploadAccountData(new ManagementController.UploadAccountDataRequest { Name = name, Content = "{}" });

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Empty(Directory.GetFiles(_dataDir));
    }

    [Fact]
    public void UploadRejectsANameThatIsNotJson()
    {
        Assert.IsType<BadRequestObjectResult>(
            Controller().UploadAccountData(new ManagementController.UploadAccountDataRequest { Name = "save.txt", Content = "{}" }));
    }

    [Fact]
    public void UploadRejectsContentThatIsNotJson()
    {
        Assert.IsType<BadRequestObjectResult>(
            Controller().UploadAccountData(new ManagementController.UploadAccountDataRequest { Name = "save.json", Content = "not json" }));
    }

    [Fact]
    public void UploadWritesAValidBareNamedJsonFile()
    {
        var result = Controller().UploadAccountData(new ManagementController.UploadAccountDataRequest { Name = "save.json", Content = "{\"a\":1}" });

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal("{\"a\":1}", File.ReadAllText(Path.Combine(_dataDir, "save.json")));
    }

    [Fact]
    public async Task UpdateAccountChangesOnlyTheFieldsItIsGiven()
    {
        using (var seed = NewContext())
        {
            seed.Accounts.Add(new AccountDBServer { ServerId = 5, Nickname = "Old", CallName = "Old", Level = 1 });
            seed.SaveChanges();
        }

        var result = await Controller().UpdateAccount(new ManagementController.UpdateAccountRequest { ServerId = 5, Nickname = "New", Level = 42 });

        Assert.IsType<OkObjectResult>(result);
        using var check = NewContext();
        var a = check.Accounts.Single(x => x.ServerId == 5);
        Assert.Equal("New", a.Nickname);
        Assert.Equal(42, a.Level);
        Assert.Equal("Old", a.CallName);
    }

    [Fact]
    public async Task UpdateAccountReportsAMissingAccountRatherThanCreatingOne()
    {
        var result = await Controller().UpdateAccount(new ManagementController.UpdateAccountRequest { ServerId = 999, Nickname = "Ghost" });

        Assert.IsType<NotFoundObjectResult>(result);
        using var check = NewContext();
        Assert.Empty(check.Accounts);
    }

    private ManagementController Controller() => new(new Factory(_dbPath), null!, null!, null!, null!);

    private SchaleDataContext NewContext()
    {
        var context = new SchaleDataContext(
            new DbContextOptionsBuilder<SchaleDataContext>().UseSqlite($"Data Source={_dbPath}").Options);
        context.Database.EnsureCreated();
        return context;
    }

    public void Dispose()
    {
        AccountDataCommand.accountDataDir = _savedDataDir;
        try { if (Directory.Exists(_dataDir)) Directory.Delete(_dataDir, true); } catch { }
        try { if (File.Exists(_dbPath)) File.Delete(_dbPath); } catch { }
    }

    private sealed class Factory(string path) : IDbContextFactory<SchaleDataContext>
    {
        public SchaleDataContext CreateDbContext()
        {
            var context = new SchaleDataContext(
                new DbContextOptionsBuilder<SchaleDataContext>().UseSqlite($"Data Source={path}").Options);
            context.Database.EnsureCreated();
            return context;
        }
    }
}
