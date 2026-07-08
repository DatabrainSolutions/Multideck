using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAuthorityRuleCondition
{
    public Guid FinauthcondId { get; set; }

    public Guid FinauthcondRuleId { get; set; }

    public string FinauthcondFieldName { get; set; } = null!;

    public string FinauthcondOperatorCode { get; set; } = null!;

    public string FinauthcondValueJson { get; set; } = null!;

    public int FinauthcondSortOrder { get; set; }

    public virtual FinAuthorityRule FinauthcondRule { get; set; } = null!;
}
