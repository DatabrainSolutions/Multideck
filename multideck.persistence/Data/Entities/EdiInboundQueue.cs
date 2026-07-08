using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiInboundQueue
{
    public Guid EdiinQId { get; set; }

    public Guid? EdiinQConnectionId { get; set; }

    public Guid? EdiinQBatchId { get; set; }

    public Guid? EdiinQMessageId { get; set; }

    public string EdiinQStatusCode { get; set; } = null!;

    public string? EdiinQProviderEventId { get; set; }

    public string? EdiinQSourceFileName { get; set; }

    public string EdiinQPayloadStorageTypeCode { get; set; } = null!;

    public string? EdiinQPayloadObjectRef { get; set; }

    public string? EdiinQRawPayloadText { get; set; }

    public DateTime EdiinQReceivedAt { get; set; }

    public DateTime? EdiinQLockedAt { get; set; }

    public string? EdiinQLockedBy { get; set; }

    public string? EdiinQLastErrorText { get; set; }

    public DateTime EdiinQCreatedAt { get; set; }

    public virtual EdiBatch? EdiinQBatch { get; set; }

    public virtual EdiConnection? EdiinQConnection { get; set; }

    public virtual EdiMessage? EdiinQMessage { get; set; }

    public virtual SysEdipayloadStorageType EdiinQPayloadStorageTypeCodeNavigation { get; set; } = null!;

    public virtual SysEdimessageStatus EdiinQStatusCodeNavigation { get; set; } = null!;
}
