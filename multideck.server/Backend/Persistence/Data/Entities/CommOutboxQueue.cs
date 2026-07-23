using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommOutboxQueue
{
    public Guid? CommSendId { get; set; }

    public Guid? CommSendMessageId { get; set; }

    public Guid? CommSendThreadId { get; set; }

    public string? CommSendChannelCode { get; set; }

    public string? CommSendStatusCode { get; set; }

    public string? CommSendPriorityCode { get; set; }

    public DateTime? CommSendScheduledAt { get; set; }

    public DateTime? CommSendNextRetryAt { get; set; }

    public int? CommSendAttemptCount { get; set; }

    public int? CommSendMaxAttempts { get; set; }

    public string? CommSendSubject { get; set; }

    public string? CommMailboxDisplayName { get; set; }

    public string? CommMailboxAddress { get; set; }

    public string? CommSendErrorMessage { get; set; }

    public DateTime? CommSendCreatedAt { get; set; }

    public DateTime? CommSendUpdatedAt { get; set; }
}
