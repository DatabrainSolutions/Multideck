using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecApitokenHash
{
    public Guid SecapiTokenId { get; set; }

    public Guid SecapiTokenClientId { get; set; }

    public string SecapiTokenName { get; set; } = null!;

    public string? SecapiTokenTokenPrefix { get; set; }

    public string SecapiTokenTokenHashSha256 { get; set; } = null!;

    public string SecapiTokenStatusCode { get; set; } = null!;

    public DateTime? SecapiTokenExpiresAt { get; set; }

    public DateTime? SecapiTokenLastUsedAt { get; set; }

    public DateTime SecapiTokenCreatedAt { get; set; }

    public Guid? SecapiTokenCreatedBy { get; set; }

    public virtual SecApiclient SecapiTokenClient { get; set; } = null!;

    public virtual CmpUser? SecapiTokenCreatedByNavigation { get; set; }

    public virtual SysSecapiClientStatus SecapiTokenStatusCodeNavigation { get; set; } = null!;
}
