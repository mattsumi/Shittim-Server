using System.Security.Cryptography;

namespace Shittim_Server.Services
{
    public static class GatewayKeyProvider
    {
        public static bool EnsureKeyPair(string directory)
        {
            var privatePath = Path.Combine(directory, "GatewayPrivateKey.pem");
            if (File.Exists(privatePath))
                return false;

            Directory.CreateDirectory(directory);
            using var rsa = RSA.Create(2048);

            var privatePem = rsa.ExportPkcs8PrivateKeyPem();
            var publicPem = rsa.ExportSubjectPublicKeyInfoPem();

            var tempPrivate = privatePath + ".tmp";
            File.WriteAllText(tempPrivate, privatePem);
            File.WriteAllText(Path.Combine(directory, "GatewayPublicKey.pem"), publicPem);
            File.Move(tempPrivate, privatePath, true);
            return true;
        }
    }
}
