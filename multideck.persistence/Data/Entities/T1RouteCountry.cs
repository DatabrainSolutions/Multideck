using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1RouteCountry
{
    public Guid T1rcId { get; set; }

    public Guid T1rcT1id { get; set; }

    public int T1rcSequenceNumber { get; set; }

    public string T1rcCountryCodeSnapshot { get; set; } = null!;

    public string? T1rcRole { get; set; }

    public DateTime T1rcCreatedAt { get; set; }

    public virtual T1Declaration T1rcT1 { get; set; } = null!;
}
