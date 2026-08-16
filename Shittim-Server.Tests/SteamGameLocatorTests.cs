using Shittim_Server.Services;
using Xunit;

namespace Shittim_Server.Tests;

// Nothing in the Windows probe order resolves under Proton: Environment.SpecialFolder.ProgramFiles and ProgramFilesX86 both come back empty on Linux, there is no registry to read, and the install lives under the user's home. InstallRoot was therefore "" for every Linux user, and each client patch service fell through to its hardcoded F:\SteamLibrary candidate and found nothing to patch.
//
// InstallRoot itself is a static Lazy resolved once per process, so driving the whole resolver from a test would fix the answer for everything that ran after it. These go at the candidate list instead.
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
    public void TheUnixRootsCoverWhereSteamActuallyInstallsItself()
    {
        var roots = SteamGameLocator.UnixSteamRoots("/home/sensei")
            .Select(x => x.Replace('\\', '/'))
            .ToList();

        Assert.Contains("/home/sensei/.steam/steam", roots);
        Assert.Contains("/home/sensei/.local/share/Steam", roots);
        Assert.Contains("/home/sensei/.var/app/com.valvesoftware.Steam/.local/share/Steam", roots);
        Assert.Contains("/home/sensei/Library/Application Support/Steam", roots);
    }

    [Fact]
    public void AHomeDirectoryWeWereNeverToldAboutYieldsNothing()
    {
        Assert.Empty(SteamGameLocator.UnixSteamRoots(""));
    }

    // The join the resolver performs on each candidate root, against a library laid out the way Steam lays one out.
    [Fact]
    public void AnInstallUnderTheUsersHomeIsReachableFromTheseRoots()
    {
        var home = Path.Combine(Path.GetTempPath(), $"shittim-home-{Guid.NewGuid():N}");
        var install = Path.Combine(home, ".local", "share", "Steam", "steamapps", "common", "BlueArchive");
        Directory.CreateDirectory(install);
        File.WriteAllText(Path.Combine(install, "GameAssembly.dll"), "not a real client");

        try
        {
            var found = SteamGameLocator.UnixSteamRoots(home)
                .Where(Directory.Exists)
                .Select(root => Path.Combine(root, "steamapps", "common", "BlueArchive", "GameAssembly.dll"))
                .FirstOrDefault(File.Exists);

            Assert.NotNull(found);
        }
        finally
        {
            Directory.Delete(home, true);
        }
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
