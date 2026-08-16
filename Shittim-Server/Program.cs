using ConsoleAppFramework;
using Shittim.CLI;

var app = ConsoleApp.Create();
app.Add("", Arguments.RunServerAsync);
app.Add("fetch-resources", Arguments.FetchResourcesAsync);
await app.RunAsync(args);
