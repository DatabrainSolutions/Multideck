using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsecSecurityProfile
{
    public Guid DocsecpId { get; set; }

    public string DocsecpCode { get; set; } = null!;

    public string DocsecpName { get; set; } = null!;

    public string? DocsecpDataScopeCode { get; set; }

    public Guid? DocsecpDocTypeId { get; set; }

    public string? DocsecpTargetTable { get; set; }

    public Guid? DocsecpOrgOfficeId { get; set; }

    public Guid? DocsecpLegalEntityId { get; set; }

    public Guid? DocsecpBrandId { get; set; }

    public Guid? DocsecpCustomerOrgId { get; set; }

    public Guid? DocsecpDefaultSigningKeyId { get; set; }

    public string DocsecpDefaultMarkTypeCode { get; set; } = null!;

    public int? DocsecpDefaultTokenValidityDays { get; set; }

    public bool DocsecpRequireContentHash { get; set; }

    public bool DocsecpRequireDigitalSignature { get; set; }

    public bool DocsecpRequirePublicVerification { get; set; }

    public bool DocsecpRequireVerificationOnPrint { get; set; }

    public bool DocsecpShowVerificationUrl { get; set; }

    public bool DocsecpIsActive { get; set; }

    public string DocsecpSettingsJson { get; set; } = null!;

    public DateTime DocsecpCreatedAt { get; set; }

    public Guid? DocsecpCreatedBy { get; set; }

    public DateTime DocsecpUpdatedAt { get; set; }

    public Guid? DocsecpUpdatedBy { get; set; }

    public virtual ICollection<BlSecurityControl> BlSecurityControls { get; set; } = new List<BlSecurityControl>();

    public virtual ICollection<DocsecVerificationToken> DocsecVerificationTokens { get; set; } = new List<DocsecVerificationToken>();

    public virtual CmpBrand? DocsecpBrand { get; set; }

    public virtual CmpUser? DocsecpCreatedByNavigation { get; set; }

    public virtual OrgMaster? DocsecpCustomerOrg { get; set; }

    public virtual SysDocBuilderDataScope? DocsecpDataScopeCodeNavigation { get; set; }

    public virtual SysDocumentSecurityMarkType DocsecpDefaultMarkTypeCodeNavigation { get; set; } = null!;

    public virtual DocsecSigningKey? DocsecpDefaultSigningKey { get; set; }

    public virtual SysDocType? DocsecpDocType { get; set; }

    public virtual CmpLegalEntity? DocsecpLegalEntity { get; set; }

    public virtual CmpOffice? DocsecpOrgOffice { get; set; }

    public virtual CmpUser? DocsecpUpdatedByNavigation { get; set; }
}
