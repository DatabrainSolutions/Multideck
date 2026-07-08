using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmInsuranceNotification
{
    public Guid ClmnotifyId { get; set; }

    public Guid? ClmnotifyPolicyId { get; set; }

    public Guid? ClmnotifyIncidentId { get; set; }

    public Guid? ClmnotifyClaimId { get; set; }

    public string ClmnotifyNotificationTypeCode { get; set; } = null!;

    public string ClmnotifyStatusCode { get; set; } = null!;

    public Guid? ClmnotifyRecipientOrgId { get; set; }

    public Guid? ClmnotifyRecipientContactId { get; set; }

    public string? ClmnotifySubject { get; set; }

    public DateTime? ClmnotifyDueAt { get; set; }

    public DateTime? ClmnotifySentAt { get; set; }

    public DateTime? ClmnotifyAcknowledgedAt { get; set; }

    public Guid? ClmnotifyCommThreadId { get; set; }

    public Guid? ClmnotifyCommMessageId { get; set; }

    public string? ClmnotifyNotes { get; set; }

    public DateTime ClmnotifyCreatedAt { get; set; }

    public Guid? ClmnotifyCreatedBy { get; set; }

    public virtual ClmClaim? ClmnotifyClaim { get; set; }

    public virtual CommMessage? ClmnotifyCommMessage { get; set; }

    public virtual CommThread? ClmnotifyCommThread { get; set; }

    public virtual CmpUser? ClmnotifyCreatedByNavigation { get; set; }

    public virtual ClmIncident? ClmnotifyIncident { get; set; }

    public virtual SysClmnotificationType ClmnotifyNotificationTypeCodeNavigation { get; set; } = null!;

    public virtual ClmInsurancePolicy? ClmnotifyPolicy { get; set; }

    public virtual OrgContact? ClmnotifyRecipientContact { get; set; }

    public virtual OrgMaster? ClmnotifyRecipientOrg { get; set; }

    public virtual SysClmnotificationStatus ClmnotifyStatusCodeNavigation { get; set; } = null!;
}
