using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditPolicySummary
{
    public Guid? AuditPolicyId { get; set; }

    public string? AuditPolicyTableSchema { get; set; }

    public string? AuditPolicyTableName { get; set; }

    public string? AuditPolicyRecordTypeCode { get; set; }

    public string? AuditPolicyModeCode { get; set; }

    public string? AuditPolicyRetentionClassCode { get; set; }

    public string? AuditPolicySensitivityCode { get; set; }

    public bool? AuditPolicyTrackInserts { get; set; }

    public bool? AuditPolicyTrackUpdates { get; set; }

    public bool? AuditPolicyTrackDeletes { get; set; }

    public bool? AuditPolicyTrackFieldChanges { get; set; }

    public bool? AuditPolicyTrackRowSnapshots { get; set; }

    public bool? AuditPolicyIsEnabled { get; set; }

    public bool? AuditPolicyTriggerInstalled { get; set; }

    public DateTime? AuditPolicyUpdatedAt { get; set; }
}
