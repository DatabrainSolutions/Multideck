using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecAuthIdentityLink
{
    public Guid SecauthLinkId { get; set; }

    public Guid SecauthLinkUserId { get; set; }

    public string SecauthLinkProviderCode { get; set; } = null!;

    public string? SecauthLinkProviderTenantRef { get; set; }

    public string SecauthLinkExternalSubjectRef { get; set; } = null!;

    public string? SecauthLinkEmailSnapshot { get; set; }

    public string SecauthLinkStatusCode { get; set; } = null!;

    public DateTime? SecauthLinkLastLoginAt { get; set; }

    public DateTime? SecauthLinkLastVerifiedAt { get; set; }

    public DateTime SecauthLinkCreatedAt { get; set; }

    public Guid? SecauthLinkCreatedBy { get; set; }

    public virtual CmpUser? SecauthLinkCreatedByNavigation { get; set; }

    public virtual SysSecauthProviderType SecauthLinkProviderCodeNavigation { get; set; } = null!;

    public virtual SysSecgrantStatus SecauthLinkStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser SecauthLinkUser { get; set; } = null!;
}
