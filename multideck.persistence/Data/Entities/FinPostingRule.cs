using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinPostingRule
{
    public Guid FinpostRuleId { get; set; }

    public string FinpostRuleCode { get; set; } = null!;

    public string FinpostRuleName { get; set; } = null!;

    public string FinpostRuleSourceTypeCode { get; set; } = null!;

    public string FinpostRuleLedgerTypeCode { get; set; } = null!;

    public Guid? FinpostRuleDebitNominalId { get; set; }

    public Guid? FinpostRuleCreditNominalId { get; set; }

    public string FinpostRuleConditionsJson { get; set; } = null!;

    public bool FinpostRuleIsActive { get; set; }

    public virtual FinNominalAccount? FinpostRuleCreditNominal { get; set; }

    public virtual FinNominalAccount? FinpostRuleDebitNominal { get; set; }

    public virtual SysFinanceLedgerType FinpostRuleLedgerTypeCodeNavigation { get; set; } = null!;
}
