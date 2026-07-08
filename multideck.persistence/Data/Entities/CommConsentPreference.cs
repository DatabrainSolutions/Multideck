using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommConsentPreference
{
    public Guid CommConsentId { get; set; }

    public string CommConsentChannelCode { get; set; } = null!;

    public Guid? CommConsentIdentityId { get; set; }

    public Guid? CommConsentOrgId { get; set; }

    public Guid? CommConsentContactId { get; set; }

    public string? CommConsentAddress { get; set; }

    public string? CommConsentNormalizedAddress { get; set; }

    public string CommConsentStatusCode { get; set; } = null!;

    public string? CommConsentLawfulBasis { get; set; }

    public string? CommConsentSource { get; set; }

    public string? CommConsentReason { get; set; }

    public DateTime CommConsentEffectiveAt { get; set; }

    public DateTime? CommConsentExpiresAt { get; set; }

    public Guid? CommConsentCapturedBy { get; set; }

    public string CommConsentMetadataJson { get; set; } = null!;

    public DateTime CommConsentCreatedAt { get; set; }

    public virtual CmpUser? CommConsentCapturedByNavigation { get; set; }

    public virtual SysCommChannel CommConsentChannelCodeNavigation { get; set; } = null!;

    public virtual OrgContact? CommConsentContact { get; set; }

    public virtual CommIdentity? CommConsentIdentity { get; set; }

    public virtual OrgMaster? CommConsentOrg { get; set; }

    public virtual SysCommConsentStatus CommConsentStatusCodeNavigation { get; set; } = null!;
}
