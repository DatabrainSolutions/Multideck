using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxShareAgreement
{
    public Guid MdxagreementId { get; set; }

    public string MdxagreementCode { get; set; } = null!;

    public string MdxagreementName { get; set; } = null!;

    public string? MdxagreementDescription { get; set; }

    public Guid MdxagreementPeerId { get; set; }

    public string MdxagreementStatusCode { get; set; } = null!;

    public string MdxagreementDirectionCode { get; set; } = null!;

    public string MdxagreementLocalRoleCode { get; set; } = null!;

    public string MdxagreementRemoteRoleCode { get; set; } = null!;

    public Guid? MdxagreementOrgOfficeId { get; set; }

    public Guid? MdxagreementLegalEntityId { get; set; }

    public Guid? MdxagreementBrandId { get; set; }

    public Guid? MdxagreementCustomerOrgId { get; set; }

    public Guid? MdxagreementRemoteCompanyId { get; set; }

    public string? MdxagreementRemoteDatabaseId { get; set; }

    public bool MdxagreementDefaultAutoAcceptMilestones { get; set; }

    public bool MdxagreementDefaultAutoAcceptTracking { get; set; }

    public bool MdxagreementRequireReviewForParties { get; set; }

    public bool MdxagreementRequireReviewForCargo { get; set; }

    public bool MdxagreementRequireReviewForDocuments { get; set; }

    public bool MdxagreementRequireReviewForCustoms { get; set; }

    public bool MdxagreementAllowDocumentSharing { get; set; }

    public bool MdxagreementAllowCommercialSharing { get; set; }

    public string MdxagreementAllowedScopesJson { get; set; } = null!;

    public string MdxagreementFieldPolicyJson { get; set; } = null!;

    public int MdxagreementRetentionDays { get; set; }

    public DateTime MdxagreementValidFrom { get; set; }

    public DateTime? MdxagreementValidUntil { get; set; }

    public DateTime? MdxagreementApprovedAt { get; set; }

    public Guid? MdxagreementApprovedBy { get; set; }

    public DateTime MdxagreementCreatedAt { get; set; }

    public Guid? MdxagreementCreatedBy { get; set; }

    public DateTime MdxagreementUpdatedAt { get; set; }

    public Guid? MdxagreementUpdatedBy { get; set; }

    public bool MdxagreementIsDeleted { get; set; }

    public virtual ICollection<MdxShareAgreementScope> MdxShareAgreementScopes { get; set; } = new List<MdxShareAgreementScope>();

    public virtual ICollection<MdxSharedJob> MdxSharedJobs { get; set; } = new List<MdxSharedJob>();

    public virtual CmpUser? MdxagreementApprovedByNavigation { get; set; }

    public virtual CmpBrand? MdxagreementBrand { get; set; }

    public virtual CmpUser? MdxagreementCreatedByNavigation { get; set; }

    public virtual OrgMaster? MdxagreementCustomerOrg { get; set; }

    public virtual SysMdxshareDirection MdxagreementDirectionCodeNavigation { get; set; } = null!;

    public virtual CmpLegalEntity? MdxagreementLegalEntity { get; set; }

    public virtual SysMdxpartnerRole MdxagreementLocalRoleCodeNavigation { get; set; } = null!;

    public virtual CmpOffice? MdxagreementOrgOffice { get; set; }

    public virtual CommFederationPeer MdxagreementPeer { get; set; } = null!;

    public virtual SysMdxpartnerRole MdxagreementRemoteRoleCodeNavigation { get; set; } = null!;

    public virtual SysMdxagreementStatus MdxagreementStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? MdxagreementUpdatedByNavigation { get; set; }
}
