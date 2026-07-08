using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceComplianceChecklist
{
    public Guid TcechecklistId { get; set; }

    public string TcechecklistNumber { get; set; } = null!;

    public string TcechecklistStatusCode { get; set; } = null!;

    public string TcechecklistTouchpointTypeCode { get; set; } = null!;

    public Guid? TcechecklistPolicyId { get; set; }

    public Guid? TcechecklistJobId { get; set; }

    public Guid? TcechecklistJobDocumentId { get; set; }

    public Guid? TcechecklistCustomerOrgId { get; set; }

    public Guid? TcechecklistOrgOfficeId { get; set; }

    public Guid? TcechecklistLegalEntityId { get; set; }

    public Guid? TcechecklistBrandId { get; set; }

    public string? TcechecklistSourceRecordTypeCode { get; set; }

    public string? TcechecklistSourceTable { get; set; }

    public Guid? TcechecklistSourceId { get; set; }

    public DateTime? TcechecklistRequiredBy { get; set; }

    public DateTime? TcechecklistCompletedAt { get; set; }

    public int TcechecklistRequiredItemCount { get; set; }

    public int TcechecklistClearItemCount { get; set; }

    public int TcechecklistReviewItemCount { get; set; }

    public int TcechecklistBlockedItemCount { get; set; }

    public string TcechecklistMetadataJson { get; set; } = null!;

    public DateTime TcechecklistCreatedAt { get; set; }

    public Guid? TcechecklistCreatedBy { get; set; }

    public DateTime TcechecklistUpdatedAt { get; set; }

    public Guid? TcechecklistUpdatedBy { get; set; }

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceReleaseGate> TceReleaseGates { get; set; } = new List<TceReleaseGate>();

    public virtual CmpBrand? TcechecklistBrand { get; set; }

    public virtual CmpUser? TcechecklistCreatedByNavigation { get; set; }

    public virtual OrgMaster? TcechecklistCustomerOrg { get; set; }

    public virtual JobHeader? TcechecklistJob { get; set; }

    public virtual JobDocument? TcechecklistJobDocument { get; set; }

    public virtual CmpLegalEntity? TcechecklistLegalEntity { get; set; }

    public virtual CmpOffice? TcechecklistOrgOffice { get; set; }

    public virtual TceScreeningPolicy? TcechecklistPolicy { get; set; }

    public virtual SysWorkflowRecordType? TcechecklistSourceRecordTypeCodeNavigation { get; set; }

    public virtual SysTcecheckStatus TcechecklistStatusCodeNavigation { get; set; } = null!;

    public virtual SysTcetouchpointType TcechecklistTouchpointTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? TcechecklistUpdatedByNavigation { get; set; }
}
