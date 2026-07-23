using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedGuarantee
{
    public Guid WmsbondGuaranteeId { get; set; }

    public Guid WmsbondGuaranteeAuthorisationId { get; set; }

    public string WmsbondGuaranteeReference { get; set; } = null!;

    public Guid? WmsbondGuaranteeProviderOrgId { get; set; }

    public string WmsbondGuaranteeCurrencyCode { get; set; } = null!;

    public decimal WmsbondGuaranteeLimitAmount { get; set; }

    public decimal WmsbondGuaranteeUsedAmount { get; set; }

    public DateOnly? WmsbondGuaranteeValidFrom { get; set; }

    public DateOnly? WmsbondGuaranteeValidTo { get; set; }

    public string WmsbondGuaranteeStatusCode { get; set; } = null!;

    public DateTime WmsbondGuaranteeCreatedAt { get; set; }

    public virtual ICollection<WmsBondedEntry> WmsBondedEntries { get; set; } = new List<WmsBondedEntry>();

    public virtual WmsBondedAuthorisation WmsbondGuaranteeAuthorisation { get; set; } = null!;

    public virtual OrgMaster? WmsbondGuaranteeProviderOrg { get; set; }
}
