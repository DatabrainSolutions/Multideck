using Multideck.Server.Modules.Inbox;
using Xunit;

namespace Multideck.Server.Tests.Modules.Inbox;

public sealed class InboxOptionsTests
{
    [Theory]
    [InlineData("http://localhost:3000")]
    [InlineData("http://127.0.0.1:3000")]
    [InlineData("https://company.multideck.app")]
    public void OAuth_configuration_accepts_https_and_loopback_return_origins(string returnOrigin)
    {
        var options = new InboxOAuthOptions
        {
            CanonicalStartEndpoint = "https://tenant.supabase.co/functions/v1/email-oauth",
            ReturnOrigin = returnOrigin,
            ReturnPath = "/inbox",
        };

        Assert.True(options.IsConfigured);
    }

    [Theory]
    [InlineData("http://company.multideck.app")]
    [InlineData("https://company.multideck.app/path")]
    [InlineData("https://company.multideck.app?next=/inbox")]
    [InlineData("https://company.multideck.app#inbox")]
    public void OAuth_configuration_rejects_insecure_or_non_origin_return_values(string returnOrigin)
    {
        var options = new InboxOAuthOptions
        {
            CanonicalStartEndpoint = "https://tenant.supabase.co/functions/v1/email-oauth",
            ReturnOrigin = returnOrigin,
            ReturnPath = "/inbox",
        };

        Assert.False(options.IsConfigured);
    }
}
