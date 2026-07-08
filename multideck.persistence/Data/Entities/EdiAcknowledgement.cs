using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiAcknowledgement
{
    public Guid EdiackId { get; set; }

    public Guid EdiackOriginalMessageId { get; set; }

    public Guid? EdiackAckMessageId { get; set; }

    public string EdiackAcknowledgementTypeCode { get; set; } = null!;

    public string EdiackStatusCode { get; set; } = null!;

    public string EdiackDirectionCode { get; set; } = null!;

    public string? EdiackControlNumber { get; set; }

    public string? EdiackResponseCode { get; set; }

    public string? EdiackResponseText { get; set; }

    public string? EdiackRawPayloadText { get; set; }

    public string? EdiackRawPayloadObjectRef { get; set; }

    public DateTime? EdiackReceivedAt { get; set; }

    public DateTime? EdiackSentAt { get; set; }

    public DateTime EdiackCreatedAt { get; set; }

    public Guid? EdiackCreatedBy { get; set; }

    public virtual EdiMessage? EdiackAckMessage { get; set; }

    public virtual SysEdiacknowledgementType EdiackAcknowledgementTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? EdiackCreatedByNavigation { get; set; }

    public virtual SysEdidirection EdiackDirectionCodeNavigation { get; set; } = null!;

    public virtual EdiMessage EdiackOriginalMessage { get; set; } = null!;

    public virtual SysEdiacknowledgementStatus EdiackStatusCodeNavigation { get; set; } = null!;
}
