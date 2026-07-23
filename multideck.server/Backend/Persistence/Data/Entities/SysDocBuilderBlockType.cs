using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocBuilderBlockType
{
    public string DocbbtCode { get; set; } = null!;

    public string DocbbtName { get; set; } = null!;

    public string? DocbbtDescription { get; set; }

    public bool DocbbtIsDataBound { get; set; }

    public bool DocbbtIsRepeating { get; set; }

    public bool DocbbtRequiresField { get; set; }

    public bool DocbbtRequiresAsset { get; set; }

    public int DocbbtSortOrder { get; set; }

    public bool DocbbtIsActive { get; set; }

    public DateTime DocbbtCreatedAt { get; set; }

    public virtual ICollection<DocbSectionLayoutBlock> DocbSectionLayoutBlocks { get; set; } = new List<DocbSectionLayoutBlock>();
}
