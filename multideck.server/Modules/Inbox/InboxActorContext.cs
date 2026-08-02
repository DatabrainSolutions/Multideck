using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;

namespace Multideck.Server.Modules.Inbox;

public sealed record InboxActor(Guid UserId, Guid CompanyId, Guid AuthUserId, string Email, string DisplayName);

public interface IInboxActorContext
{
    Task<InboxActor> RequireAsync(ClaimsPrincipal principal, CancellationToken cancellationToken);
}

public sealed class InboxActorContext(MultideckContext db) : IInboxActorContext
{
    public async Task<InboxActor> RequireAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(principal.FindFirstValue("sub"), out var authUserId))
        {
            throw InboxException.Forbidden("Your session is not linked to a Multideck profile yet.");
        }

        var actor = await db.CmpUsers
            .AsNoTracking()
            .Where(user => user.AuthUserId == authUserId && user.CompanyId.HasValue)
            .Select(user => new
            {
                user.UserId,
                CompanyId = user.CompanyId!.Value,
                user.UserEmail,
                user.UserFirstname,
                user.UserLastname,
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (actor is null)
        {
            throw InboxException.Forbidden("Your account is not linked to an active Multideck company profile.");
        }

        var displayName = string.Join(' ', new[] { actor.UserFirstname, actor.UserLastname }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim()));

        return new InboxActor(
            actor.UserId,
            actor.CompanyId,
            authUserId,
            actor.UserEmail,
            string.IsNullOrWhiteSpace(displayName) ? actor.UserEmail : displayName);
    }
}
