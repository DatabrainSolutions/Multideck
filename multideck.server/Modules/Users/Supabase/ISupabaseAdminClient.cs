using Multideck.Server.Configuration;

namespace Multideck.Server.Modules.Users.Supabase;

public interface ISupabaseAdminClient
{
    Task<SupabaseInviteResult> InviteUserAsync(
        CreateUserRequest request,
        string normalizedEmail,
        SupabaseAuthOptions supabaseAuth,
        CancellationToken cancellationToken);
}
