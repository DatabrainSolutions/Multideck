using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiOutboundQueue
{
    public Guid EdioutQId { get; set; }

    public Guid EdioutQMessageId { get; set; }

    public Guid? EdioutQMessageProfileId { get; set; }

    public Guid? EdioutQConnectionId { get; set; }

    public string EdioutQStatusCode { get; set; } = null!;

    public string EdioutQPriorityCode { get; set; } = null!;

    public DateTime EdioutQScheduledAt { get; set; }

    public DateTime? EdioutQLockedAt { get; set; }

    public string? EdioutQLockedBy { get; set; }

    public int EdioutQAttemptCount { get; set; }

    public int EdioutQMaxAttempts { get; set; }

    public DateTime? EdioutQNextRetryAt { get; set; }

    public string? EdioutQLastErrorText { get; set; }

    public DateTime EdioutQCreatedAt { get; set; }

    public virtual EdiConnection? EdioutQConnection { get; set; }

    public virtual EdiMessage EdioutQMessage { get; set; } = null!;

    public virtual EdiMessageProfile? EdioutQMessageProfile { get; set; }

    public virtual SysEdimessageStatus EdioutQStatusCodeNavigation { get; set; } = null!;
}
