using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsecSigningKey
{
    public Guid DocseckId { get; set; }

    public string DocseckCode { get; set; } = null!;

    public string DocseckName { get; set; } = null!;

    public Guid? DocseckOrgOfficeId { get; set; }

    public Guid? DocseckLegalEntityId { get; set; }

    public Guid? DocseckBrandId { get; set; }

    public string DocseckAlgorithmCode { get; set; } = null!;

    public string? DocseckPublicKeyPem { get; set; }

    public string? DocseckKeyVaultRef { get; set; }

    public string? DocseckKeyFingerprintSha256 { get; set; }

    public DateTime DocseckValidFrom { get; set; }

    public DateTime? DocseckValidTo { get; set; }

    public bool DocseckIsDefault { get; set; }

    public bool DocseckIsActive { get; set; }

    public string DocseckMetadataJson { get; set; } = null!;

    public DateTime DocseckCreatedAt { get; set; }

    public Guid? DocseckCreatedBy { get; set; }

    public DateTime DocseckUpdatedAt { get; set; }

    public Guid? DocseckUpdatedBy { get; set; }

    public virtual ICollection<BlSecurityControl> BlSecurityControls { get; set; } = new List<BlSecurityControl>();

    public virtual ICollection<DocsecDocumentSignature> DocsecDocumentSignatures { get; set; } = new List<DocsecDocumentSignature>();

    public virtual ICollection<DocsecSecurityProfile> DocsecSecurityProfiles { get; set; } = new List<DocsecSecurityProfile>();

    public virtual SysDocumentSecuritySignatureAlgorithm DocseckAlgorithmCodeNavigation { get; set; } = null!;

    public virtual CmpBrand? DocseckBrand { get; set; }

    public virtual CmpUser? DocseckCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? DocseckLegalEntity { get; set; }

    public virtual CmpOffice? DocseckOrgOffice { get; set; }

    public virtual CmpUser? DocseckUpdatedByNavigation { get; set; }
}
