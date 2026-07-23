using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommMessageSummary
{
    public Guid? CommMessageId { get; set; }

    public Guid? CommMessageThreadId { get; set; }

    public string? CommThreadSubject { get; set; }

    public string? CommMessageChannelCode { get; set; }

    public string? CommMessageDirectionCode { get; set; }

    public string? CommMessageStatusCode { get; set; }

    public string? CommMessageSubject { get; set; }

    public string? CommMessageBodyPreview { get; set; }

    public DateTime? CommMessageMessageDate { get; set; }

    public DateTime? CommMessageReceivedAt { get; set; }

    public DateTime? CommMessageSentAt { get; set; }

    public DateTime? CommMessageDeliveredAt { get; set; }

    public DateTime? CommMessageReadAt { get; set; }

    public bool? CommMessageHasAttachments { get; set; }

    public bool? CommMessageIsSpam { get; set; }

    public string? CommMessageAiintent { get; set; }

    public decimal? CommMessageAiconfidence { get; set; }

    public string? CommMailboxDisplayName { get; set; }

    public string? CommMailboxAddress { get; set; }

    public string? CommMessagePrincipalRecipients { get; set; }

    public int? CommMessageAttachmentCount { get; set; }
}
