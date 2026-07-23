using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbSectionLayoutCell
{
    public Guid DocbslcId { get; set; }

    public Guid DocbslcRowId { get; set; }

    public int DocbslcColumnStart { get; set; }

    public int DocbslcColumnSpan { get; set; }

    public int DocbslcSortOrder { get; set; }

    public string DocbslcVerticalAlign { get; set; } = null!;

    public string DocbslcStyleJson { get; set; } = null!;

    public string DocbslcConditionJson { get; set; } = null!;

    public DateTime DocbslcCreatedAt { get; set; }

    public Guid? DocbslcCreatedBy { get; set; }

    public virtual ICollection<DocbSectionLayoutBlock> DocbSectionLayoutBlocks { get; set; } = new List<DocbSectionLayoutBlock>();

    public virtual ICollection<DocbTemplateQaissue> DocbTemplateQaissues { get; set; } = new List<DocbTemplateQaissue>();

    public virtual CmpUser? DocbslcCreatedByNavigation { get; set; }

    public virtual DocbSectionLayoutRow DocbslcRow { get; set; } = null!;
}
