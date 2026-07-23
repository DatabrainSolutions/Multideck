using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcematchStrength
{
    public string TcematchStrengthCode { get; set; } = null!;

    public string TcematchStrengthName { get; set; } = null!;

    public decimal TcematchStrengthMinScore { get; set; }

    public bool TcematchStrengthIsReviewRequired { get; set; }

    public bool TcematchStrengthIsActive { get; set; }

    public int TcematchStrengthSortOrder { get; set; }

    public virtual ICollection<TceScreeningMatch> TceScreeningMatches { get; set; } = new List<TceScreeningMatch>();
}
