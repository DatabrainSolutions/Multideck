using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceCustomerFlexibilityLevel
{
    public string FinflexCode { get; set; } = null!;

    public string FinflexName { get; set; } = null!;

    public string? FinflexDescription { get; set; }

    public int FinflexSortOrder { get; set; }

    public bool FinflexIsActive { get; set; }

    public virtual ICollection<FinCreditProfile> FinCreditProfiles { get; set; } = new List<FinCreditProfile>();

    public virtual ICollection<FinCustomerPaymentBehaviour> FinCustomerPaymentBehaviours { get; set; } = new List<FinCustomerPaymentBehaviour>();
}
