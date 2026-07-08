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
        var connectionString =
            Environment.GetEnvironmentVariable("MULTIDECK_CONNECTION")
            ?? "Host=db.aqtwypsuijxlnvtxpuxe.supabase.co;Database=postgres;Username=postgres;Password=39Water9DEGate;SSL Mode=Require;Trust Server Certificate=true";

        var options = new DbContextOptionsBuilder<MultideckContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new MultideckContext(options);
    }
}
