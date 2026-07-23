using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommConsentSummary
{
    public Guid? CommConsentId { get; set; }

    public string? CommConsentChannelCode { get; set; }

    public Guid? CommConsentIdentityId { get; set; }

    public string? CommIdentityDisplayName { get; set; }

    public string? CommConsentNormalizedAddress { get; set; }

    public Guid? CommConsentOrgId { get; set; }

    public string? CommConsentOrgName { get; set; }

    public Guid? CommConsentContactId { get; set; }

    public string? OrgContactFirstName { get; set; }

    public string? OrgContactLastName { get; set; }

    public string? CommConsentStatusCode { get; set; }

    public bool? CommConsentStatusIsBlock { get; set; }

    public string? CommConsentLawfulBasis { get; set; }

    public string? CommConsentSource { get; set; }

    public DateTime? CommConsentEffectiveAt { get; set; }

    public DateTime? CommConsentExpiresAt { get; set; }

    public DateTime? CommConsentCreatedAt { get; set; }
}
