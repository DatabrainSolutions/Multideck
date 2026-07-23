using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiBatch
{
    public Guid EdibatchId { get; set; }

    public Guid? EdibatchConnectionId { get; set; }

    public Guid? EdibatchTradingPartnerId { get; set; }

    public string EdibatchDirectionCode { get; set; } = null!;

    public string EdibatchStandardCode { get; set; } = null!;

    public string EdibatchStatusCode { get; set; } = null!;

    public string? EdibatchInterchangeControlNumber { get; set; }

    public string? EdibatchGroupControlNumber { get; set; }

    public string? EdibatchEnvelopeType { get; set; }

    public string? EdibatchFileName { get; set; }

    public string EdibatchPayloadStorageTypeCode { get; set; } = null!;

    public string? EdibatchPayloadObjectRef { get; set; }

    public string? EdibatchPayloadHash { get; set; }

    public DateTime? EdibatchReceivedAt { get; set; }

    public DateTime? EdibatchSentAt { get; set; }

    public int EdibatchMessageCount { get; set; }

    public int EdibatchErrorCount { get; set; }

    public string EdibatchMetadataJson { get; set; } = null!;

    public DateTime EdibatchCreatedAt { get; set; }

    public Guid? EdibatchCreatedBy { get; set; }

    public virtual ICollection<EdiInboundQueue> EdiInboundQueues { get; set; } = new List<EdiInboundQueue>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<EdiProcessingEvent> EdiProcessingEvents { get; set; } = new List<EdiProcessingEvent>();

    public virtual ICollection<EdiProcessingRun> EdiProcessingRuns { get; set; } = new List<EdiProcessingRun>();

    public virtual ICollection<EdiValidationIssue> EdiValidationIssues { get; set; } = new List<EdiValidationIssue>();

    public virtual EdiConnection? EdibatchConnection { get; set; }

    public virtual CmpUser? EdibatchCreatedByNavigation { get; set; }

    public virtual SysEdidirection EdibatchDirectionCodeNavigation { get; set; } = null!;

    public virtual SysEdipayloadStorageType EdibatchPayloadStorageTypeCodeNavigation { get; set; } = null!;

    public virtual SysEdistandard EdibatchStandardCodeNavigation { get; set; } = null!;

    public virtual SysEdimessageStatus EdibatchStatusCodeNavigation { get; set; } = null!;

    public virtual EdiTradingPartner? EdibatchTradingPartner { get; set; }
}
