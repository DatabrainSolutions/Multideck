using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB special handling codes and free-text handling instructions.
/// </summary>
public partial class AwbSpecialHandling
{
    public Guid AwbshId { get; set; }

    public Guid AwbshAwbid { get; set; }

    public Guid? AwbshGoodsItemId { get; set; }

    public string? AwbshCode { get; set; }

    public string? AwbshDescription { get; set; }

    public string? AwbshInstructions { get; set; }

    public int AwbshSortOrder { get; set; }

    public DateTime AwbshCreatedAt { get; set; }

    public virtual AwbHeader AwbshAwb { get; set; } = null!;

    public virtual SysAwbspecialHandlingCode? AwbshCodeNavigation { get; set; }

    public virtual AwbGoodsItem? AwbshGoodsItem { get; set; }
}
