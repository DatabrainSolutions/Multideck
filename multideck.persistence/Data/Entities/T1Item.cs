using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1Item
{
    public Guid T1iId { get; set; }

    public Guid T1iT1id { get; set; }

    public Guid? T1iT1consignmentId { get; set; }

    public int T1iItemNumber { get; set; }

    public string? T1iCommodityCode { get; set; }

    public string T1iDescriptionOfGoods { get; set; } = null!;

    public string? T1iCountryOfDispatchCodeSnapshot { get; set; }

    public string? T1iCountryOfDestinationCodeSnapshot { get; set; }

    public decimal? T1iGrossMass { get; set; }

    public decimal? T1iNetMass { get; set; }

    public decimal? T1iSupplementaryUnits { get; set; }

    public decimal? T1iItemValueAmount { get; set; }

    public string? T1iItemValueCurrencyCodeSnapshot { get; set; }

    public string T1iPackagesJson { get; set; } = null!;

    public string T1iItemJson { get; set; } = null!;

    public DateTime T1iCreatedAt { get; set; }

    public Guid? T1iJobCargoId { get; set; }

    public virtual ICollection<T1DataElement> T1DataElements { get; set; } = new List<T1DataElement>();

    public virtual ICollection<T1Document> T1Documents { get; set; } = new List<T1Document>();

    public virtual ICollection<T1Party> T1Parties { get; set; } = new List<T1Party>();

    public virtual ICollection<T1ValidationResult> T1ValidationResults { get; set; } = new List<T1ValidationResult>();

    public virtual JobCargo? T1iJobCargo { get; set; }

    public virtual T1Declaration T1iT1 { get; set; } = null!;

    public virtual T1Consignment? T1iT1consignment { get; set; }
}
