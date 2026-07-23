using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecApiclient
{
    public Guid SecapiClientId { get; set; }

    public string SecapiClientCode { get; set; } = null!;

    public string SecapiClientName { get; set; } = null!;

    public string SecapiClientStatusCode { get; set; } = null!;

    public Guid? SecapiClientOwnerUserId { get; set; }

    public Guid? SecapiClientOrgOfficeId { get; set; }

    public string SecapiClientAllowedIpsJson { get; set; } = null!;

    public int? SecapiClientRateLimitPerMinute { get; set; }

    public string? SecapiClientDescription { get; set; }

    public DateTime SecapiClientCreatedAt { get; set; }

    public Guid? SecapiClientCreatedBy { get; set; }

    public virtual ICollection<ObsApirequest> ObsApirequests { get; set; } = new List<ObsApirequest>();

    public virtual ICollection<SecApiclientScope> SecApiclientScopes { get; set; } = new List<SecApiclientScope>();

    public virtual ICollection<SecApitokenHash> SecApitokenHashes { get; set; } = new List<SecApitokenHash>();

    public virtual ICollection<SecCredentialGrant> SecCredentialGrants { get; set; } = new List<SecCredentialGrant>();

    public virtual CmpUser? SecapiClientCreatedByNavigation { get; set; }

    public virtual CmpOffice? SecapiClientOrgOffice { get; set; }

    public virtual CmpUser? SecapiClientOwnerUser { get; set; }

    public virtual SysSecapiClientStatus SecapiClientStatusCodeNavigation { get; set; } = null!;
}
