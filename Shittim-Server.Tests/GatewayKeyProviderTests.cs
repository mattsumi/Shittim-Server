using System.Security.Cryptography;
using Shittim_Server.Services;
using Xunit;

namespace Shittim_Server.Tests;

public class GatewayKeyProviderTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), $"shittim-gwkey-{Guid.NewGuid():N}");

    [Fact]
    public void AFreshDirectoryGetsAnImportableKeyPairWhoseHalvesMatch()
    {
        Assert.True(GatewayKeyProvider.EnsureKeyPair(_dir));

        var privatePem = File.ReadAllText(Path.Combine(_dir, "GatewayPrivateKey.pem"));
        var publicPem = File.ReadAllText(Path.Combine(_dir, "GatewayPublicKey.pem"));

        using var rsa = RSA.Create();
        rsa.ImportFromPem(privatePem);
        Assert.Equal(2048, rsa.KeySize);
        Assert.Equal(rsa.ExportSubjectPublicKeyInfoPem().Trim(), publicPem.Trim());
    }

    [Fact]
    public void AnExistingKeyIsLeftUntouched()
    {
        GatewayKeyProvider.EnsureKeyPair(_dir);
        var first = File.ReadAllText(Path.Combine(_dir, "GatewayPrivateKey.pem"));

        Assert.False(GatewayKeyProvider.EnsureKeyPair(_dir));
        Assert.Equal(first, File.ReadAllText(Path.Combine(_dir, "GatewayPrivateKey.pem")));
    }

    [Fact]
    public void TheGeneratedKeyDecryptsWhatItsOwnPublicHalfEncrypts()
    {
        GatewayKeyProvider.EnsureKeyPair(_dir);

        using var pub = RSA.Create();
        pub.ImportFromPem(File.ReadAllText(Path.Combine(_dir, "GatewayPublicKey.pem")));
        using var priv = RSA.Create();
        priv.ImportFromPem(File.ReadAllText(Path.Combine(_dir, "GatewayPrivateKey.pem")));

        var secret = new byte[] { 1, 2, 3, 4, 5, 6, 7, 8 };
        var cipher = pub.Encrypt(secret, RSAEncryptionPadding.OaepSHA256);
        Assert.Equal(secret, priv.Decrypt(cipher, RSAEncryptionPadding.OaepSHA256));
    }

    public void Dispose()
    {
        if (Directory.Exists(_dir))
            Directory.Delete(_dir, true);
    }
}
