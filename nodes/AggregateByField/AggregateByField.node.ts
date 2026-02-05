import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class AggregateByField implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Aggregate By Field',
		name: 'aggregateByField',
		icon: 'file:aggregateByField.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["fieldToGroupBy"]}}',
		description: 'Aggregate/group input items by a specified field value',
		defaults: {
			name: 'Aggregate By Field',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Field To Group By',
				name: 'fieldToGroupBy',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. Category',
				description: 'The name of the field to group the input items by. Items with the same value in this field will be grouped together.',
				hint: 'Use dot notation for nested fields (e.g. "address.city")',
			},
			{
				displayName: 'Output Field Name',
				name: 'outputFieldName',
				type: 'string',
				default: 'items',
				description: 'The name of the field in the output that will contain the array of grouped items',
			},
			{
				displayName: 'Include Group Key In Output',
				name: 'includeGroupKey',
				type: 'boolean',
				default: true,
				description: 'Whether to include the grouping field and its value in each output item',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Handle Missing Values',
						name: 'handleMissingValues',
						type: 'options',
						default: 'skip',
						description: 'How to handle items where the grouping field is missing or undefined',
						options: [
							{
								name: 'Skip Item',
								value: 'skip',
								description: 'Skip items that do not have the grouping field',
							},
							{
								name: 'Group as "undefined"',
								value: 'groupUndefined',
								description: 'Group items without the field under a key called "undefined"',
							},
							{
								name: 'Group as "null"',
								value: 'groupNull',
								description: 'Group items without the field under a key called "null"',
							},
							{
								name: 'Group as Empty String',
								value: 'groupEmpty',
								description: 'Group items without the field under an empty string key',
							},
						],
					},
					{
						displayName: 'Sort Groups',
						name: 'sortGroups',
						type: 'options',
						default: 'none',
						description: 'How to sort the output groups',
						options: [
							{
								name: 'No Sorting',
								value: 'none',
								description: 'Keep groups in the order they were first encountered',
							},
							{
								name: 'Ascending',
								value: 'asc',
								description: 'Sort groups alphabetically (A-Z)',
							},
							{
								name: 'Descending',
								value: 'desc',
								description: 'Sort groups reverse alphabetically (Z-A)',
							},
						],
					},
					{
						displayName: 'Include Item Count',
						name: 'includeItemCount',
						type: 'boolean',
						default: false,
						description: 'Whether to include a count of items in each group',
					},
					{
						displayName: 'Item Count Field Name',
						name: 'itemCountFieldName',
						type: 'string',
						default: 'itemCount',
						description: 'The field name for the item count',
						displayOptions: {
							show: {
								includeItemCount: [true],
							},
						},
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		// Get parameters
		const fieldToGroupBy = this.getNodeParameter('fieldToGroupBy', 0) as string;
		const outputFieldName = this.getNodeParameter('outputFieldName', 0) as string;
		const includeGroupKey = this.getNodeParameter('includeGroupKey', 0) as boolean;
		const options = this.getNodeParameter('options', 0) as IDataObject;

		const handleMissingValues = (options.handleMissingValues as string) || 'skip';
		const sortGroups = (options.sortGroups as string) || 'none';
		const includeItemCount = (options.includeItemCount as boolean) || false;
		const itemCountFieldName = (options.itemCountFieldName as string) || 'itemCount';

		if (!fieldToGroupBy) {
			throw new NodeOperationError(
				this.getNode(),
				'The "Field To Group By" parameter is required',
			);
		}

		// Helper function to get nested field value using dot notation
		const getNestedValue = (obj: IDataObject, path: string): unknown => {
			const keys = path.split('.');
			let value: unknown = obj;

			for (const key of keys) {
				if (value === null || value === undefined) {
					return undefined;
				}
				if (typeof value === 'object' && value !== null) {
					value = (value as IDataObject)[key];
				} else {
					return undefined;
				}
			}

			return value;
		};

		// Group the items
		const grouped: Map<string, IDataObject[]> = new Map();

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const item = items[itemIndex];
			let groupKey = getNestedValue(item.json, fieldToGroupBy);

			// Handle missing/undefined values
			if (groupKey === undefined || groupKey === null) {
				switch (handleMissingValues) {
					case 'skip':
						continue;
					case 'groupUndefined':
						groupKey = 'undefined';
						break;
					case 'groupNull':
						groupKey = 'null';
						break;
					case 'groupEmpty':
						groupKey = '';
						break;
				}
			}

			// Convert to string for consistent grouping
			const keyString = String(groupKey);

			if (!grouped.has(keyString)) {
				grouped.set(keyString, []);
			}

			grouped.get(keyString)!.push(item.json);
		}

		// Get group keys and optionally sort them
		let groupKeys = Array.from(grouped.keys());

		if (sortGroups === 'asc') {
			groupKeys.sort((a, b) => a.localeCompare(b));
		} else if (sortGroups === 'desc') {
			groupKeys.sort((a, b) => b.localeCompare(a));
		}

		// Build output items
		const outputItems: INodeExecutionData[] = groupKeys.map((key) => {
			const groupItems = grouped.get(key)!;
			const outputJson: IDataObject = {};

			if (includeGroupKey) {
				// Handle nested field names - use the last part as the key name
				const keyName = fieldToGroupBy.includes('.')
					? fieldToGroupBy.split('.').pop()!
					: fieldToGroupBy;
				outputJson[keyName] = key;
			}

			outputJson[outputFieldName] = groupItems;

			if (includeItemCount) {
				outputJson[itemCountFieldName] = groupItems.length;
			}

			return {
				json: outputJson,
				pairedItem: { item: 0 }, // Link to first input item for debugging
			};
		});

		return [outputItems];
	}
}
