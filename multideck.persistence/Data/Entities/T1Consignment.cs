using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1Consignment
{
    public Guid T1cId { get; set; }

    public Guid T1cT1id { get; set; }

    public int T1cConsignmentNumber { get; set; }

    public Guid? T1cConsignorOrgId { get; set; }

    public Guid? T1cConsigneeOrgId { get; set; }

    public string? T1cCountryOfDispatchCodeSnapshot { get; set; }

    public string? T1cCountryOfDestinationCodeSnapshot { get; set; }

    public decimal? T1cGrossMass { get; set; }

    public int? T1cTotalPackages { get; set; }

    public string T1cConsignmentJson { get; set; } = null!;

    public DateTime T1cCreatedAt { get; set; }

    public virtual ICollection<T1Item> T1Items { get; set; } = new List<T1Item>();

    public virtual T1Declaration T1cT1 { get; set; } = null!;
}
