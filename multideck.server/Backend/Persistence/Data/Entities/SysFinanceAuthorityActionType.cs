using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceAuthorityActionType
{
    public string FinauthaCode { get; set; } = null!;

    public string FinauthaName { get; set; } = null!;

    public string? FinauthaDescription { get; set; }

    public int FinauthaSortOrder { get; set; }

    public bool FinauthaIsActive { get; set; }

    public virtual ICollection<FinAuthorisationRequest> FinAuthorisationRequests { get; set; } = new List<FinAuthorisationRequest>();

    public virtual ICollection<FinAuthorityRule> FinAuthorityRules { get; set; } = new List<FinAuthorityRule>();
}
