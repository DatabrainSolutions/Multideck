using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Modules.Inbox.Luna;
using Multideck.Server.Modules.Inbox.OAuth;

namespace Multideck.Server.Modules.Inbox;

[ApiController]
[ApiVersion("1.0")]
[Authorize]
[Route("api/v{version:apiVersion}/inbox")]
[Produces("application/json")]
[TypeFilter(typeof(InboxExceptionFilter))]
public sealed class InboxController(
    IInboxService inbox,
    IInboxOAuthService oauth,
    ILunaThreadSummaryService luna,
    IInboxAttachmentService attachments) : ControllerBase
{
    [HttpGet("providers")]
    public ActionResult<IReadOnlyList<InboxProviderAvailabilityDto>> Providers() => Ok(inbox.GetProviderAvailability());

    [HttpGet("connections")]
    public async Task<ActionResult<IReadOnlyList<InboxConnectionDto>>> Connections(CancellationToken cancellationToken) =>
        Ok(await inbox.ListConnectionsAsync(User, cancellationToken));

    [HttpPost("connections/{provider}/authorize")]
    public async Task<ActionResult<StartInboxOAuthResponse>> AuthorizeProvider(string provider, CancellationToken cancellationToken) =>
        Ok(await oauth.StartAsync(User, provider, Request.Headers.Authorization.ToString(), cancellationToken));

    [HttpDelete("connections/{connectionId:guid}")]
    public async Task<IActionResult> Disconnect(Guid connectionId, CancellationToken cancellationToken)
    {
        await inbox.DisconnectAsync(User, connectionId, cancellationToken);
        return NoContent();
    }

    [HttpGet("mailboxes")]
    public async Task<ActionResult<IReadOnlyList<InboxMailboxDto>>> Mailboxes(CancellationToken cancellationToken) =>
        Ok(await inbox.ListMailboxesAsync(User, cancellationToken));

    [HttpPost("connections/{connectionId:guid}/shared-mailboxes")]
    public async Task<ActionResult<InboxMailboxDto>> AddSharedMailbox(
        Guid connectionId,
        [FromBody] AddSharedMailboxRequest request,
        CancellationToken cancellationToken) =>
        Ok(await inbox.AddSharedMailboxAsync(User, connectionId, request, cancellationToken));

    [HttpPost("mailboxes/{mailboxId:guid}/sync")]
    public async Task<IActionResult> Sync(Guid mailboxId, CancellationToken cancellationToken)
    {
        await inbox.RequestSyncAsync(User, mailboxId, cancellationToken);
        return NoContent();
    }

    [HttpGet("threads")]
    public async Task<ActionResult<InboxThreadListResponse>> Threads(
        [FromQuery] Guid? mailboxId,
        [FromQuery] string? folder,
        [FromQuery] string? query,
        [FromQuery] string? cursor,
        [FromQuery] int limit = 25,
        CancellationToken cancellationToken = default) =>
        Ok(await inbox.ListThreadsAsync(User, mailboxId, folder, query, cursor, limit, cancellationToken));

    [HttpGet("threads/{threadId:guid}")]
    public async Task<ActionResult<InboxThreadDetailDto>> Thread(Guid threadId, CancellationToken cancellationToken) =>
        Ok(await inbox.GetThreadAsync(User, threadId, cancellationToken));

    [HttpPatch("threads/{threadId:guid}/read-state")]
    public async Task<ActionResult<InboxThreadUserStateDto>> UpdateReadState(
        Guid threadId,
        [FromBody] UpdateInboxThreadStateRequest request,
        CancellationToken cancellationToken) =>
        Ok(await inbox.UpdateThreadStateAsync(User, threadId, request, cancellationToken));

    [HttpPost("threads/{threadId:guid}/summary")]
    public async Task<ActionResult<InboxThreadSummaryDto>> Summarize(Guid threadId, CancellationToken cancellationToken) =>
        Ok(await luna.SummarizeAsync(User, threadId, refresh: true, cancellationToken));

    [HttpPost("drafts")]
    public async Task<ActionResult<InboxDraftDto>> CreateDraft([FromBody] InboxDraftRequest request, CancellationToken cancellationToken) =>
        Ok(await inbox.CreateDraftAsync(User, request, cancellationToken));

    [HttpPatch("drafts/{draftId:guid}")]
    public async Task<ActionResult<InboxDraftDto>> UpdateDraft(Guid draftId, [FromBody] InboxDraftRequest request, CancellationToken cancellationToken) =>
        Ok(await inbox.UpdateDraftAsync(User, draftId, request, cancellationToken));

    [HttpDelete("drafts/{draftId:guid}")]
    public async Task<IActionResult> DeleteDraft(Guid draftId, CancellationToken cancellationToken)
    {
        await inbox.DeleteDraftAsync(User, draftId, cancellationToken);
        return NoContent();
    }

    [HttpPost("send")]
    public async Task<ActionResult<InboxSendReceiptDto>> Send([FromBody] InboxDraftRequest request, CancellationToken cancellationToken)
    {
        var idempotencyKey = Request.Headers["Idempotency-Key"].ToString().Trim();
        if (string.IsNullOrWhiteSpace(idempotencyKey)) throw InboxException.BadRequest("An Idempotency-Key header is required when sending email.");
        return Ok(await inbox.SendAsync(User, request, idempotencyKey, cancellationToken));
    }

    [HttpGet("attachments/{attachmentId:guid}")]
    [Produces("application/octet-stream")]
    public async Task<IActionResult> Attachment(Guid attachmentId, CancellationToken cancellationToken)
    {
        var download = await attachments.DownloadAsync(User, attachmentId, cancellationToken);
        Response.Headers.XContentTypeOptions = "nosniff";
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers["X-Content-Safety"] = download.IsScanned ? "scanned-clean" : "unscanned-provider-content";
        return File(download.Content, download.MimeType, download.FileName, enableRangeProcessing: false);
    }
}
