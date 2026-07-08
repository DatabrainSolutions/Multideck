using System;
using System.Collections.Generic;
using System.Net;

namespace Multideck.Persistence.Entities;

public partial class AuditEvent
{
    public Guid AuditEventId { get; set; }

    public string AuditEventEventTypeCode { get; set; } = null!;

    public string AuditEventOutcomeStatusCode { get; set; } = null!;

    public string AuditEventActorTypeCode { get; set; } = null!;

    public Guid? AuditEventUserId { get; set; }

    public Guid? AuditEventAuthUserId { get; set; }

    public Guid? AuditEventOrgOfficeId { get; set; }

    public Guid? AuditEventLegalEntityId { get; set; }

    public Guid? AuditEventBrandId { get; set; }

    public Guid? AuditEventRequestContextId { get; set; }

    public string? AuditEventRequestId { get; set; }

    public string? AuditEventSessionId { get; set; }

    public string? AuditEventCorrelationId { get; set; }

    public string? AuditEventSourceApp { get; set; }

    public string? AuditEventSourceModule { get; set; }

    public string? AuditEventSourceTableSchema { get; set; }

    public string? AuditEventSourceTableName { get; set; }

    public string? AuditEventRecordTypeCode { get; set; }

    public Guid? AuditEventRecordId { get; set; }

    public string AuditEventRecordKeyJson { get; set; } = null!;

    public string? AuditEventAction { get; set; }

    public string? AuditEventReason { get; set; }

    public string? AuditEventTitle { get; set; }

    public Guid? AuditEventParentAuditEventId { get; set; }

    public Guid? AuditEventWorkflowEventId { get; set; }

    public Guid? AuditEventAiTaskRunId { get; set; }

    public DateTime AuditEventOccurredAt { get; set; }

    public long AuditEventTransactionId { get; set; }

    public string AuditEventDatabaseUser { get; set; } = null!;

    public IPAddress? AuditEventClientAddress { get; set; }

    public string? AuditEventOldRowHash { get; set; }

    public string? AuditEventNewRowHash { get; set; }

    public int AuditEventChangedFieldCount { get; set; }

    public bool AuditEventHasFieldChanges { get; set; }

    public bool AuditEventHasRowSnapshot { get; set; }

    public bool AuditEventIsSensitive { get; set; }

    public string AuditEventSensitivityCode { get; set; } = null!;

    public string AuditEventRetentionClassCode { get; set; } = null!;

    public string AuditEventMetadataJson { get; set; } = null!;

    public virtual ICollection<AuditAccessEvent> AuditAccessEvents { get; set; } = new List<AuditAccessEvent>();

    public virtual SysAuditActorType AuditEventActorTypeCodeNavigation { get; set; } = null!;

    public virtual AiTaskRun? AuditEventAiTaskRun { get; set; }

    public virtual CmpBrand? AuditEventBrand { get; set; }

    public virtual SysAuditEventType AuditEventEventTypeCodeNavigation { get; set; } = null!;

    public virtual CmpLegalEntity? AuditEventLegalEntity { get; set; }

    public virtual CmpOffice? AuditEventOrgOffice { get; set; }

    public virtual SysAuditOutcomeStatus AuditEventOutcomeStatusCodeNavigation { get; set; } = null!;

    public virtual AuditEvent? AuditEventParentAuditEvent { get; set; }

    public virtual SysWorkflowRecordType? AuditEventRecordTypeCodeNavigation { get; set; }

    public virtual AuditRequestContext? AuditEventRequestContext { get; set; }

    public virtual SysAuditRetentionClass AuditEventRetentionClassCodeNavigation { get; set; } = null!;

    public virtual SysAuditSensitivityLevel AuditEventSensitivityCodeNavigation { get; set; } = null!;

    public virtual CmpUser? AuditEventUser { get; set; }

    public virtual WorkflowEvent? AuditEventWorkflowEvent { get; set; }

    public virtual ICollection<AuditExportEvent> AuditExportEvents { get; set; } = new List<AuditExportEvent>();

    public virtual ICollection<AuditFieldChange> AuditFieldChanges { get; set; } = new List<AuditFieldChange>();

    public virtual ICollection<AuditRetentionJobItem> AuditRetentionJobItems { get; set; } = new List<AuditRetentionJobItem>();

    public virtual ICollection<AuditReviewCaseEvent> AuditReviewCaseEvents { get; set; } = new List<AuditReviewCaseEvent>();

    public virtual ICollection<AuditRowSnapshot> AuditRowSnapshots { get; set; } = new List<AuditRowSnapshot>();

    public virtual ICollection<AuditEvent> InverseAuditEventParentAuditEvent { get; set; } = new List<AuditEvent>();
}
