using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB other/customs information used for OCI-style regulatory declarations and border references.
/// </summary>
public partial class AwbCustomsInformation
{
    public Guid AwbciId { get; set; }

    public Guid AwbciAwbid { get; set; }

    public Guid? AwbciGoodsItemId { get; set; }

    public Guid? AwbciCountryId { get; set; }

    public string? AwbciCountryCodeSnapshot { get; set; }

    public string? AwbciInformationIdentifier { get; set; }

    public string? AwbciCustomsReference { get; set; }

    public string? AwbciSupplementaryInformation { get; set; }

    public string? AwbciSource { get; set; }

    public DateTime AwbciCreatedAt { get; set; }

    public virtual AwbHeader AwbciAwb { get; set; } = null!;

    public virtual AwbGoodsItem? AwbciGoodsItem { get; set; }
}
