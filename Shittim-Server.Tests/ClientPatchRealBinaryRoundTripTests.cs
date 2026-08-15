using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using BlueArchiveAPI.Configuration;
using Microsoft.Extensions.Logging;
using Shittim_Server.Services;
using Xunit;
using Xunit.Abstractions;

namespace Shittim_Server.Tests;

[Collection("native-ias-patch")]
public class ClientPatchRealBinaryRoundTripTests : IDisposable
{
    private readonly ITestOutputHelper output;
    private readonly string _dir = Path.Combine(Path.GetTempPath(), $"shittim-realbin-{Guid.NewGuid():N}");
    private readonly Dictionary<string, byte[]?> _savedRegionConfig = new();

    public ClientPatchRealBinaryRoundTripTests(ITestOutputHelper output)
    {
        this.output = output;
        Directory.CreateDirectory(_dir);

        var regionConfigDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "AppData", "LocalLow", "Nexon Games", "Blue Archive");
        foreach (var name in new[] { "LocalConfig.json", "LastConnectSaveData" })
        {
            var path = Path.Combine(regionConfigDir, name);
            _savedRegionConfig[path] = File.Exists(path) ? File.ReadAllBytes(path) : null;
        }
    }

    [Fact]
    public async Task NativeIasRestoreIsTheExactInverseOfPatchingTheRealModule()
    {
        var source = SteamGameLocator.FindGameFile(Path.Combine("BlueArchive_Data", "Plugins", "x86_64", "gamescale.core.dll"));
        if (string.IsNullOrEmpty(source)) { SkipNote("no Blue Archive install found on this machine"); return; }

        var installHashBefore = Sha(File.ReadAllBytes(source));
        var copy = Path.Combine(_dir, "gamescale.core.dll");
        File.Copy(source, copy);
        var pristine = Sha(File.ReadAllBytes(copy));

        SetIasEnv(copy);
        var log = new RecordingLogger<ClientNativeIasPatchService>();
        var service = new ClientNativeIasPatchService(log);
        await service.StartAsync(CancellationToken.None);

        var statePath = copy + ".shittim_native_ias_patch.json";
        if (!PatchWasApplied(statePath)) { SkipNote($"gamescale.core.dll build {installHashBefore[..12]} matched no patch signatures"); return; }

        var state = JsonDocument.Parse(File.ReadAllText(statePath)).RootElement;
        Assert.Equal(Sha(File.ReadAllBytes(copy)), state.GetProperty("PatchedSha256").GetString());
        Assert.NotEqual(pristine, Sha(File.ReadAllBytes(copy)));
        Assert.Equal(pristine, state.GetProperty("OriginalSha256").GetString());

        await service.StopAsync(CancellationToken.None);

        Assert.Equal(pristine, Sha(File.ReadAllBytes(copy)));
        Assert.False(File.Exists(statePath));
        Assert.Equal(installHashBefore, Sha(File.ReadAllBytes(source)));
    }

    [Fact]
    public async Task TheRealModuleStillRestoresToPristineAfterBeingPatchedTwice()
    {
        var source = SteamGameLocator.FindGameFile(Path.Combine("BlueArchive_Data", "Plugins", "x86_64", "gamescale.core.dll"));
        if (string.IsNullOrEmpty(source)) { SkipNote("no Blue Archive install found on this machine"); return; }

        var installHashBefore = Sha(File.ReadAllBytes(source));
        var copy = Path.Combine(_dir, "gamescale.core.dll");
        File.Copy(source, copy);
        var pristine = Sha(File.ReadAllBytes(copy));

        SetIasEnv(copy);
        var log = new RecordingLogger<ClientNativeIasPatchService>();

        await new ClientNativeIasPatchService(log).StartAsync(CancellationToken.None);

        var statePath = copy + ".shittim_native_ias_patch.json";
        if (!PatchWasApplied(statePath)) { SkipNote($"gamescale.core.dll build {installHashBefore[..12]} matched no patch signatures"); return; }

        var service = new ClientNativeIasPatchService(log);
        await service.StartAsync(CancellationToken.None);
        await service.StopAsync(CancellationToken.None);

        Assert.Equal(pristine, Sha(File.ReadAllBytes(copy)));
        Assert.False(File.Exists(statePath));
        Assert.Equal(installHashBefore, Sha(File.ReadAllBytes(source)));
    }

    [Fact]
    public async Task RestoringTheRegionResetsTheSavedNameEvenWhenTheMetadataScanBailsOut()
    {
        var regionDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "AppData", "LocalLow", "Nexon Games", "Blue Archive");
        Directory.CreateDirectory(regionDir);

        var localConfig = Path.Combine(regionDir, "LocalConfig.json");
        var lastConnect = Path.Combine(regionDir, "LastConnectSaveData");
        File.WriteAllText(localConfig, "{\"StringTable\":{\"LastRegion\":\"Sensei\"}}");
        File.WriteAllText(lastConnect, "{\"Region\":\"Sensei\"}");

        Environment.SetEnvironmentVariable("SHITTIM_CLIENT_METADATA_PATH", Path.Combine(_dir, "does-not-exist.dat"));
        Config.Instance.ServerConfiguration.RegionDisplayText = "";

        await new ClientRegionLabelPatchService(new RecordingLogger<ClientRegionLabelPatchService>())
            .StopAsync(CancellationToken.None);

        var savedRegion = JsonNode.Parse(File.ReadAllText(localConfig))!["StringTable"]!["LastRegion"]!.GetValue<string>();
        var savedConnect = JsonNode.Parse(File.ReadAllText(lastConnect))!["Region"]!.GetValue<string>();
        Assert.Equal("asia", savedRegion);
        Assert.Equal("asia", savedConnect);
    }

    private static bool PatchWasApplied(string statePath)
    {
        if (!File.Exists(statePath))
            return false;

        var state = JsonDocument.Parse(File.ReadAllText(statePath)).RootElement;
        return state.GetProperty("Patches").GetArrayLength() > 0;
    }

    private static void SetIasEnv(string modulePath)
    {
        Environment.SetEnvironmentVariable("SHITTIM_IAS_PATCH_PORT", "5000");
        Environment.SetEnvironmentVariable("SHITTIM_AUTO_PATCH_GAMESCALE_IAS", "true");
        Environment.SetEnvironmentVariable("SHITTIM_CLIENT_GAMESCALE_CORE_PATH", modulePath);
    }

    private void SkipNote(string reason) =>
        output.WriteLine($"skipped: {reason}");

    private static string Sha(byte[] content) => Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();

    public void Dispose()
    {
        Config.Instance.ServerConfiguration.RegionDisplayText = "";
        new ClientRegionLabelPatchService(new RecordingLogger<ClientRegionLabelPatchService>())
            .StopAsync(CancellationToken.None).GetAwaiter().GetResult();

        foreach (var name in new[]
        {
            "SHITTIM_IAS_PATCH_PORT", "SHITTIM_AUTO_PATCH_GAMESCALE_IAS",
            "SHITTIM_CLIENT_GAMESCALE_CORE_PATH", "SHITTIM_CLIENT_METADATA_PATH"
        })
            Environment.SetEnvironmentVariable(name, null);

        foreach (var (path, content) in _savedRegionConfig)
        {
            if (content != null)
                File.WriteAllBytes(path, content);
            else if (File.Exists(path))
                File.Delete(path);
        }

        if (Directory.Exists(_dir))
            Directory.Delete(_dir, true);
    }

    private sealed class RecordingLogger<T> : ILogger<T>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable BeginScope<TState>(TState state) where TState : notnull => null!;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Entries.Add((logLevel, formatter(state, exception)));
        }
    }
}
