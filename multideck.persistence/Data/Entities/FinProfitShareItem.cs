using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinProfitShareItem
{
    public Guid FinpsitemId { get; set; }

    public Guid FinpsitemRunId { get; set; }

    public Guid? FinpsitemAgreementId { get; set; }

    public Guid? FinpsitemRuleId { get; set; }

    public Guid? FinpsitemJobId { get; set; }

    public Guid? FinpsitemPartnerOrgId { get; set; }

    public decimal FinpsitemBasisAmount { get; set; }

    public decimal FinpsitemShareAmount { get; set; }

    public string FinpsitemStatusCode { get; set; } = null!;

    public virtual ICollection<FinProfitShareSettlement> FinProfitShareSettlements { get; set; } = new List<FinProfitShareSettlement>();

    public virtual FinProfitShareAgreement? FinpsitemAgreement { get; set; }

    public virtual JobHeader? FinpsitemJob { get; set; }

    public virtual OrgMaster? FinpsitemPartnerOrg { get; set; }

    public virtual FinProfitShareRule? FinpsitemRule { get; set; }

    public virtual FinProfitShareRun FinpsitemRun { get; set; } = null!;
}
