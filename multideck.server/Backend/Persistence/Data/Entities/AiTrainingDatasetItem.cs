using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiTrainingDatasetItem
{
    public Guid AitdiId { get; set; }

    public Guid AitdiDatasetId { get; set; }

    public Guid AitdiTrainingItemId { get; set; }

    public string AitdiSplit { get; set; } = null!;

    public decimal AitdiWeight { get; set; }

    public DateTime AitdiCreatedAt { get; set; }

    public virtual AiTrainingDataset AitdiDataset { get; set; } = null!;

    public virtual AiTrainingItem AitdiTrainingItem { get; set; } = null!;
}
