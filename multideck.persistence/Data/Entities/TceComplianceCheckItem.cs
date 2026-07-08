using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceComplianceCheckItem
{
    public Guid TcecheckItemId { get; set; }

    public Guid TcecheckItemChecklistId { get; set; }

    public string TcecheckItemCheckTypeCode { get; set; } = null!;

    public string TcecheckItemStatusCode { get; set; } = null!;

    public string? TcecheckItemActionTypeCode { get; set; }

    public string TcecheckItemRiskLevelCode { get; set; } = null!;

    public Guid? TcecheckItemJobId { get; set; }

    public Guid? TcecheckItemJobCargoId { get; set; }

    public Guid? TcecheckItemJobDocumentId { get; set; }

    public Guid? TcecheckItemOrgId { get; set; }

    public Guid? TcecheckItemContactId { get; set; }

    public Guid? TcecheckItemScreeningRunId { get; set; }

    public Guid? TcecheckItemSubjectId { get; set; }

    public Guid? TcecheckItemMatchId { get; set; }

    public Guid? TcecheckItemCaseId { get; set; }

    public Guid? TcecheckItemHoldId { get; set; }

    public Guid? TcecheckItemLicenseId { get; set; }

    public Guid? TcecheckItemClassificationId { get; set; }

    public Guid? TcecheckItemOriginId { get; set; }

    public Guid? TcecheckItemPreferenceClaimId { get; set; }

    public Guid? TcecheckItemWorkflowTaskId { get; set; }

    public string? TcecheckItemSourceRecordTypeCode { get; set; }

    public string? TcecheckItemSourceTable { get; set; }

    public Guid? TcecheckItemSourceId { get; set; }

    public string? TcecheckItemRequiredBeforeActionCode { get; set; }

    public bool TcecheckItemIsMandatory { get; set; }

    public bool TcecheckItemIsBlocking { get; set; }

    public Guid? TcecheckItemAssignedUserId { get; set; }

    public DateTime? TcecheckItemDueAt { get; set; }

    public DateTime? TcecheckItemCompletedAt { get; set; }

    public Guid? TcecheckItemCompletedBy { get; set; }

    public string? TcecheckItemResultSummary { get; set; }

    public string TcecheckItemMetadataJson { get; set; } = null!;

    public DateTime TcecheckItemCreatedAt { get; set; }

    public Guid? TcecheckItemCreatedBy { get; set; }

    public DateTime TcecheckItemUpdatedAt { get; set; }

    public Guid? TcecheckItemUpdatedBy { get; set; }

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceReleaseGate> TceReleaseGates { get; set; } = new List<TceReleaseGate>();

    public virtual SysTceactionType? TcecheckItemActionTypeCodeNavigation { get; set; }

    public virtual CmpUser? TcecheckItemAssignedUser { get; set; }

    public virtual TceComplianceCase? TcecheckItemCase { get; set; }

    public virtual SysTcecheckType TcecheckItemCheckTypeCodeNavigation { get; set; } = null!;

    public virtual TceComplianceChecklist TcecheckItemChecklist { get; set; } = null!;

    public virtual TceHsclassification? TcecheckItemClassification { get; set; }

    public virtual CmpUser? TcecheckItemCompletedByNavigation { get; set; }

    public virtual OrgContact? TcecheckItemContact { get; set; }

    public virtual CmpUser? TcecheckItemCreatedByNavigation { get; set; }

    public virtual TceComplianceHold? TcecheckItemHold { get; set; }

    public virtual JobHeader? TcecheckItemJob { get; set; }

    public virtual JobCargo? TcecheckItemJobCargo { get; set; }

    public virtual JobDocument? TcecheckItemJobDocument { get; set; }

    public virtual TceLicense? TcecheckItemLicense { get; set; }

    public virtual TceScreeningMatch? TcecheckItemMatch { get; set; }

    public virtual OrgMaster? TcecheckItemOrg { get; set; }

    public virtual TceOriginDeclaration? TcecheckItemOrigin { get; set; }

    public virtual TcePreferenceClaim? TcecheckItemPreferenceClaim { get; set; }

    public virtual SysTceriskLevel TcecheckItemRiskLevelCodeNavigation { get; set; } = null!;

    public virtual TceScreeningRun? TcecheckItemScreeningRun { get; set; }

    public virtual SysWorkflowRecordType? TcecheckItemSourceRecordTypeCodeNavigation { get; set; }

    public virtual SysTcecheckStatus TcecheckItemStatusCodeNavigation { get; set; } = null!;

    public virtual TceScreeningSubject? TcecheckItemSubject { get; set; }

    public virtual CmpUser? TcecheckItemUpdatedByNavigation { get; set; }

    public virtual WorkflowTask? TcecheckItemWorkflowTask { get; set; }
}
