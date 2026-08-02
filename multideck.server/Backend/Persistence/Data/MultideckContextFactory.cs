using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Multideck.Persistence;

/// <summary>
/// Design-time factory used by EF Core tooling (migrations, scaffolding) so the
/// persistence project can be targeted directly without the server as a startup project.
/// The runtime app still configures the context through <c>AddMultideckPersistence</c>.
/// </summary>
public sealed class MultideckContextFactory : IDesignTimeDbContextFactory<MultideckContext>
{
    public MultideckContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("MULTIDECK_CONNECTION");

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "MULTIDECK_CONNECTION is required for design-time EF operations. " +
                "Use the intended tenant database; credentials must not be committed to source control.");
        }

        var options = new DbContextOptionsBuilder<MultideckContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new MultideckContext(options);
    }
}
