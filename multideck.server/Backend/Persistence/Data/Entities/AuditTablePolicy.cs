using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditTablePolicy
{
    public Guid AuditPolicyId { get; set; }

    public string AuditPolicyTableSchema { get; set; } = null!;

    public string AuditPolicyTableName { get; set; } = null!;

    public string? AuditPolicyRecordTypeCode { get; set; }

    public string AuditPolicyModeCode { get; set; } = null!;

    public string AuditPolicyRetentionClassCode { get; set; } = null!;

    public string AuditPolicySensitivityCode { get; set; } = null!;

    public bool AuditPolicyTrackInserts { get; set; }

    public bool AuditPolicyTrackUpdates { get; set; }

    public bool AuditPolicyTrackDeletes { get; set; }

    public bool AuditPolicyTrackFieldChanges { get; set; }

    public bool AuditPolicyTrackRowSnapshots { get; set; }

    public bool AuditPolicyTrackUnchangedUpdates { get; set; }

    public bool AuditPolicyFailClosed { get; set; }

    public string AuditPolicyKeyColumnsJson { get; set; } = null!;

    public string AuditPolicyIncludeColumnsJson { get; set; } = null!;

    public string AuditPolicyIgnoreColumnsJson { get; set; } = null!;

    public string AuditPolicyRedactColumnsJson { get; set; } = null!;

    public string AuditPolicyMetadataJson { get; set; } = null!;

    public bool AuditPolicyIsEnabled { get; set; }

    public DateTime AuditPolicyCreatedAt { get; set; }

    public Guid? AuditPolicyCreatedBy { get; set; }

    public DateTime AuditPolicyUpdatedAt { get; set; }

    public Guid? AuditPolicyUpdatedBy { get; set; }

    public virtual CmpUser? AuditPolicyCreatedByNavigation { get; set; }

    public virtual SysAuditPolicyMode AuditPolicyModeCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowRecordType? AuditPolicyRecordTypeCodeNavigation { get; set; }

    public virtual SysAuditRetentionClass AuditPolicyRetentionClassCodeNavigation { get; set; } = null!;

    public virtual SysAuditSensitivityLevel AuditPolicySensitivityCodeNavigation { get; set; } = null!;

    public virtual CmpUser? AuditPolicyUpdatedByNavigation { get; set; }
}
