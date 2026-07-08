using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinPaymentTerm
{
    public Guid FintermId { get; set; }

    public string FintermCode { get; set; } = null!;

    public string FintermName { get; set; } = null!;

    public int FintermDays { get; set; }

    public int? FintermDueDayOfMonth { get; set; }

    public bool FintermEndOfMonth { get; set; }

    public bool FintermIsCashAccount { get; set; }

    public bool FintermIsActive { get; set; }

    public DateTime FintermCreatedAt { get; set; }

    public virtual ICollection<FinCreditProfile> FinCreditProfiles { get; set; } = new List<FinCreditProfile>();
}
