using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinProfitShareAgreement
{
    public Guid FinpsaId { get; set; }

    public string FinpsaCode { get; set; } = null!;

    public string FinpsaName { get; set; } = null!;

    public Guid? FinpsaPartnerOrgId { get; set; }

    public Guid? FinpsaCustomerOrgId { get; set; }

    public string FinpsaBasisCode { get; set; } = null!;

    public DateOnly FinpsaEffectiveFrom { get; set; }

    public DateOnly? FinpsaEffectiveTo { get; set; }

    public bool FinpsaIsActive { get; set; }

    public virtual ICollection<FinProfitShareItem> FinProfitShareItems { get; set; } = new List<FinProfitShareItem>();

    public virtual ICollection<FinProfitShareRule> FinProfitShareRules { get; set; } = new List<FinProfitShareRule>();

    public virtual SysFinanceProfitShareBasis FinpsaBasisCodeNavigation { get; set; } = null!;

    public virtual OrgMaster? FinpsaCustomerOrg { get; set; }

    public virtual OrgMaster? FinpsaPartnerOrg { get; set; }
}
