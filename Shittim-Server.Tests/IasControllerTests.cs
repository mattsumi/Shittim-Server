using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Shittim_Server.Controllers.SDK;
using Xunit;

namespace Shittim_Server.Tests;

public class IasControllerTests
{
    [Fact]
    public async Task IssuingAGameTokenReturnsErrorCodeAsANumericZeroNotAString()
    {
        var value = await ResponseValue(c => c.IssueGameTokenByTicket());

        var errorCode = Property(value, "error_code");
        Assert.IsType<int>(errorCode);
        Assert.Equal(0, errorCode);
    }

    [Fact]
    public async Task IssuingAGameTokenAlwaysCarriesANonEmptyGameToken()
    {
        var value = await ResponseValue(c => c.IssueGameTokenByTicket());

        Assert.False(string.IsNullOrWhiteSpace(Property(value, "game_token") as string));
        Assert.Equal(Property(value, "game_token"), Property(value, "access_token"));
    }

    [Fact]
    public async Task IssuingATicketReportsSuccessAndCarriesTheTicketAndWebToken()
    {
        var value = await ResponseValue(c => c.IssueTicketByWebToken());

        Assert.Equal("success", Property(value, "status") as string);
        Assert.Equal("0", Property(value, "errorCode") as string);
        Assert.False(string.IsNullOrWhiteSpace(Property(value, "ticket") as string));
        Assert.False(string.IsNullOrWhiteSpace(Property(value, "web_token") as string));
    }

    private static async Task<object> ResponseValue(Func<IasController, Task<IResult>> call)
    {
        var controller = new IasController(NullLogger<IasController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { Request = { Body = new MemoryStream() } } },
        };

        var result = await call(controller);
        var value = result.GetType().GetProperty("Value")!.GetValue(result);
        Assert.NotNull(value);
        return value!;
    }

    private static object? Property(object value, string name) =>
        value.GetType().GetProperty(name)!.GetValue(value);
}
