using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbFieldCatalog
{
    public Guid DocbfId { get; set; }

    public Guid DocbfDataSourceId { get; set; }

    public string DocbfFieldPath { get; set; } = null!;

    public string DocbfLabel { get; set; } = null!;

    public string DocbfDataType { get; set; } = null!;

    public string? DocbfDescription { get; set; }

    public bool DocbfIsRepeating { get; set; }

    public bool DocbfIsRequired { get; set; }

    public bool DocbfIsSensitive { get; set; }

    public string? DocbfFormatHint { get; set; }

    public string? DocbfSampleValue { get; set; }

    public int DocbfSortOrder { get; set; }

    public bool DocbfIsActive { get; set; }

    public DateTime DocbfCreatedAt { get; set; }

    public virtual ICollection<DocbSectionLayoutBlock> DocbSectionLayoutBlocks { get; set; } = new List<DocbSectionLayoutBlock>();

    public virtual DocbDataSource DocbfDataSource { get; set; } = null!;
}
