using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinNominalAccount
{
    public Guid FinnomId { get; set; }

    public string FinnomCode { get; set; } = null!;

    public string FinnomName { get; set; } = null!;

    public string FinnomAccountTypeCode { get; set; } = null!;

    public Guid? FinnomLegalEntityId { get; set; }

    public string? FinnomExternalMappingHint { get; set; }

    public bool FinnomIsControlAccount { get; set; }

    public bool FinnomIsActive { get; set; }

    public DateTime FinnomCreatedAt { get; set; }

    public virtual ICollection<FinBankAccount> FinBankAccounts { get; set; } = new List<FinBankAccount>();

    public virtual ICollection<FinChargeAccountingRule> FinChargeAccountingRules { get; set; } = new List<FinChargeAccountingRule>();

    public virtual ICollection<FinDocumentLine> FinDocumentLines { get; set; } = new List<FinDocumentLine>();

    public virtual ICollection<FinPostingLine> FinPostingLines { get; set; } = new List<FinPostingLine>();

    public virtual ICollection<FinPostingRule> FinPostingRuleFinpostRuleCreditNominals { get; set; } = new List<FinPostingRule>();

    public virtual ICollection<FinPostingRule> FinPostingRuleFinpostRuleDebitNominals { get; set; } = new List<FinPostingRule>();

    public virtual CmpLegalEntity? FinnomLegalEntity { get; set; }
}
