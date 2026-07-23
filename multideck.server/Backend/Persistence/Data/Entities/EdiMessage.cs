using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiMessage
{
    public Guid EdimessageId { get; set; }

    public Guid? EdimessageBatchId { get; set; }

    public Guid? EdimessageMessageProfileId { get; set; }

    public Guid? EdimessageMappingVersionId { get; set; }

    public Guid? EdimessageConnectionId { get; set; }

    public Guid? EdimessageTradingPartnerId { get; set; }

    public string EdimessageDirectionCode { get; set; } = null!;

    public string EdimessageMessageTypeCode { get; set; } = null!;

    public string EdimessageStandardCode { get; set; } = null!;

    public string EdimessageStatusCode { get; set; } = null!;

    public string EdimessageAcknowledgementStatusCode { get; set; } = null!;

    public string? EdimessageControlNumber { get; set; }

    public string? EdimessageFunctionalGroupControlNumber { get; set; }

    public string? EdimessageConversationId { get; set; }

    public string? EdimessageCorrelationId { get; set; }

    public string? EdimessageDocumentReference { get; set; }

    public Guid? EdimessageJobId { get; set; }

    public Guid? EdimessageCusQuoteHeaderId { get; set; }

    public Guid? EdimessageBlid { get; set; }

    public Guid? EdimessageAwbid { get; set; }

    public Guid? EdimessageCustomsId { get; set; }

    public Guid? EdimessageCdsid { get; set; }

    public Guid? EdimessageT1id { get; set; }

    public Guid? EdimessageFindocumentId { get; set; }

    public Guid? EdimessageWorkflowTaskId { get; set; }

    public string EdimessagePayloadStorageTypeCode { get; set; } = null!;

    public string? EdimessageRawPayloadText { get; set; }

    public string? EdimessageRawPayloadObjectRef { get; set; }

    public string? EdimessageRawPayloadHash { get; set; }

    public string EdimessageParsedJson { get; set; } = null!;

    public string EdimessageCanonicalJson { get; set; } = null!;

    public string? EdimessageGeneratedFromTable { get; set; }

    public Guid? EdimessageGeneratedFromId { get; set; }

    public DateTime? EdimessageReceivedAt { get; set; }

    public DateTime? EdimessageSentAt { get; set; }

    public DateTime? EdimessageProcessedAt { get; set; }

    public DateTime? EdimessageAckDueAt { get; set; }

    public int EdimessageRetryCount { get; set; }

    public string? EdimessageLastErrorText { get; set; }

    public string EdimessageMetadataJson { get; set; } = null!;

    public DateTime EdimessageCreatedAt { get; set; }

    public Guid? EdimessageCreatedBy { get; set; }

    public DateTime EdimessageUpdatedAt { get; set; }

    public Guid? EdimessageUpdatedBy { get; set; }

    public virtual ICollection<EdiAcknowledgement> EdiAcknowledgementEdiackAckMessages { get; set; } = new List<EdiAcknowledgement>();

    public virtual ICollection<EdiAcknowledgement> EdiAcknowledgementEdiackOriginalMessages { get; set; } = new List<EdiAcknowledgement>();

    public virtual ICollection<EdiAiinsight> EdiAiinsights { get; set; } = new List<EdiAiinsight>();

    public virtual ICollection<EdiInboundQueue> EdiInboundQueues { get; set; } = new List<EdiInboundQueue>();

    public virtual ICollection<EdiMessageLink> EdiMessageLinks { get; set; } = new List<EdiMessageLink>();

    public virtual ICollection<EdiOutboundQueue> EdiOutboundQueues { get; set; } = new List<EdiOutboundQueue>();

    public virtual ICollection<EdiProcessingEvent> EdiProcessingEvents { get; set; } = new List<EdiProcessingEvent>();

    public virtual ICollection<EdiProcessingRun> EdiProcessingRuns { get; set; } = new List<EdiProcessingRun>();

    public virtual ICollection<EdiValidationIssue> EdiValidationIssues { get; set; } = new List<EdiValidationIssue>();

    public virtual ICollection<EdiWebhookEvent> EdiWebhookEvents { get; set; } = new List<EdiWebhookEvent>();

    public virtual SysEdiacknowledgementStatus EdimessageAcknowledgementStatusCodeNavigation { get; set; } = null!;

    public virtual AwbHeader? EdimessageAwb { get; set; }

    public virtual EdiBatch? EdimessageBatch { get; set; }

    public virtual BlHeader? EdimessageBl { get; set; }

    public virtual CdsDeclaration? EdimessageCds { get; set; }

    public virtual EdiConnection? EdimessageConnection { get; set; }

    public virtual CmpUser? EdimessageCreatedByNavigation { get; set; }

    public virtual CusQuoteHeader? EdimessageCusQuoteHeader { get; set; }

    public virtual CustomsDeclaration? EdimessageCustoms { get; set; }

    public virtual SysEdidirection EdimessageDirectionCodeNavigation { get; set; } = null!;

    public virtual FinDocument? EdimessageFindocument { get; set; }

    public virtual JobHeader? EdimessageJob { get; set; }

    public virtual EdiMappingVersion? EdimessageMappingVersion { get; set; }

    public virtual EdiMessageProfile? EdimessageMessageProfile { get; set; }

    public virtual SysEdimessageType EdimessageMessageTypeCodeNavigation { get; set; } = null!;

    public virtual SysEdipayloadStorageType EdimessagePayloadStorageTypeCodeNavigation { get; set; } = null!;

    public virtual SysEdistandard EdimessageStandardCodeNavigation { get; set; } = null!;

    public virtual SysEdimessageStatus EdimessageStatusCodeNavigation { get; set; } = null!;

    public virtual T1Declaration? EdimessageT1 { get; set; }

    public virtual EdiTradingPartner? EdimessageTradingPartner { get; set; }

    public virtual CmpUser? EdimessageUpdatedByNavigation { get; set; }

    public virtual WorkflowTask? EdimessageWorkflowTask { get; set; }

    public virtual ICollection<WmsInboundAdvice> WmsInboundAdvices { get; set; } = new List<WmsInboundAdvice>();

    public virtual ICollection<WmsIntegrationEvent> WmsIntegrationEvents { get; set; } = new List<WmsIntegrationEvent>();

    public virtual ICollection<WmsOrder> WmsOrders { get; set; } = new List<WmsOrder>();
}
